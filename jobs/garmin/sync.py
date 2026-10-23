"""Synchro Garmin de Synapse : résumé quotidien et activités → `synapse.garmin_*`.

Lancé par GitHub Actions (.github/workflows/garmin-sync.yml) toutes les 3 h.
Pas d'API officielle pour un particulier : on passe par la lib non officielle
`garminconnect`, puis on fait un upsert via l'API REST de Supabase avec la clé
service_role (qui contourne la RLS).

Jetons de session : `Garmin.login(tokenstore)` relit les jetons du dossier
GARMIN_TOKENSTORE, les rafraîchit s'ils expirent, et ne se reconnecte avec le
mot de passe que s'ils sont absents ou refusés (puis les réécrit). Le workflow
garde ce dossier, chiffré, dans le cache Actions : Garmin bloque un compte qui
se reconnecte toutes les 3 h.

Chaque passage laisse une ligne dans `synapse.sync_runs` (source `garmin`).

Variables d'environnement :
  GARMIN_EMAIL, GARMIN_PASSWORD          compte Garmin Connect
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY projet Supabase partagé avec Cairn
  SYNAPSE_USER_ID                        uuid du compte (auth.users) à alimenter
  GARMIN_TOKENSTORE                      dossier des jetons (défaut ~/.garminconnect)
  GARMIN_SYNC_DAYS                       jours relus à chaque passage (défaut 3)
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

TIME_ZONE = ZoneInfo("Europe/Paris")
DEFAULT_DAYS = 3
MAX_DAYS = 90


# Lecture défensive des réponses Garmin -----------------------------------------
# Les champs bougent d'une version de Garmin Connect à l'autre : un champ absent
# ou d'un type inattendu donne `None`, jamais une exception.


def _dig(data: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(data, dict):
            return None
        data = data.get(key)
    return data


def _int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return round(float(value))
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _from_epoch_ms(value: Any) -> str | None:
    ms = _float(value)
    if ms is None or ms <= 0:
        return None
    return datetime.fromtimestamp(ms / 1000, UTC).isoformat()


def _from_gmt(value: Any) -> str | None:
    """« 2026-10-23 07:12:05 » (heure GMT de Garmin) → ISO 8601 UTC."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace(" ", "T"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC).isoformat()


def daily_row(user_id: str, day: str, summary: Any, sleep: Any, vo2max: float | None) -> dict:
    """Ligne `garmin_daily` à partir du résumé du jour et du sommeil de la nuit."""
    dto = _dig(sleep, "dailySleepDTO") or {}
    return {
        "user_id": user_id,
        "day": day,
        "sleep_start_at": _from_epoch_ms(dto.get("sleepStartTimestampGMT")),
        "sleep_end_at": _from_epoch_ms(dto.get("sleepEndTimestampGMT")),
        "sleep_seconds": _int(dto.get("sleepTimeSeconds")),
        "deep_sleep_seconds": _int(dto.get("deepSleepSeconds")),
        "light_sleep_seconds": _int(dto.get("lightSleepSeconds")),
        "rem_sleep_seconds": _int(dto.get("remSleepSeconds")),
        "awake_seconds": _int(dto.get("awakeSleepSeconds")),
        "sleep_score": _int(_dig(dto, "sleepScores", "overall", "value")),
        "body_battery_charged": _int(_dig(sleep, "bodyBatteryChange")),
        "body_battery_at_wake": _int(_dig(summary, "bodyBatteryAtWakeTime")),
        "body_battery_high": _int(_dig(summary, "bodyBatteryHighestValue")),
        "body_battery_low": _int(_dig(summary, "bodyBatteryLowestValue")),
        "steps": _int(_dig(summary, "totalSteps")),
        "steps_goal": _int(_dig(summary, "dailyStepGoal")),
        "resting_hr": _int(_dig(summary, "restingHeartRate"))
        or _int(_dig(sleep, "restingHeartRate")),
        "vo2max": vo2max,
    }


def vo2max_by_day(metrics: Any) -> dict[str, float]:
    """VO2max (valeur précise si fournie) par date, depuis `get_max_metrics_range`."""
    result: dict[str, float] = {}
    for entry in metrics if isinstance(metrics, list) else []:
        generic = _dig(entry, "generic") or {}
        day = generic.get("calendarDate")
        value = _float(generic.get("vo2MaxPreciseValue")) or _float(generic.get("vo2MaxValue"))
        if isinstance(day, str) and value:
            result[day[:10]] = value
    return result


def activity_row(user_id: str, activity: dict) -> dict | None:
    activity_id = _int(activity.get("activityId"))
    start_at = _from_gmt(activity.get("startTimeGMT"))
    if activity_id is None or start_at is None:
        return None
    return {
        "user_id": user_id,
        "activity_id": activity_id,
        "name": activity.get("activityName") or None,
        "activity_type": _dig(activity, "activityType", "typeKey"),
        "start_at": start_at,
        "duration_seconds": _float(activity.get("duration")),
        "distance_meters": _float(activity.get("distance")),
        "avg_hr": _int(activity.get("averageHR")),
        "max_hr": _int(activity.get("maxHR")),
        "elevation_gain_meters": _float(activity.get("elevationGain")),
        "calories": _int(activity.get("calories")),
    }


# Supabase (PostgREST, schéma synapse) ------------------------------------------


class Supabase:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.base = f"{url.rstrip('/')}/rest/v1"
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
                # Schéma `synapse` (exposé dans Settings > API) pour les écritures.
                "Content-Profile": "synapse",
                "Accept-Profile": "synapse",
            }
        )

    def _check(self, response: requests.Response, what: str) -> requests.Response:
        if not response.ok:
            raise RuntimeError(f"{what} : HTTP {response.status_code} {response.text[:300]}")
        return response

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> None:
        if not rows:
            return
        self._check(
            self.session.post(
                f"{self.base}/{table}",
                params={"on_conflict": on_conflict},
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                json=rows,
                timeout=30,
            ),
            f"upsert {table}",
        )

    def start_run(self, user_id: str) -> int | None:
        try:
            response = self._check(
                self.session.post(
                    f"{self.base}/sync_runs",
                    headers={"Prefer": "return=representation"},
                    json={"user_id": user_id, "source": "garmin"},
                    timeout=30,
                ),
                "sync_runs",
            )
            return response.json()[0]["id"]
        except Exception as e:  # le journal ne doit pas empêcher la synchro
            print(f"[garmin-sync] sync_runs : {e}", file=sys.stderr)
            return None

    def finish_run(self, run_id: int | None, status: str, error: str | None = None) -> None:
        if run_id is None:
            return
        try:
            self._check(
                self.session.patch(
                    f"{self.base}/sync_runs",
                    params={"id": f"eq.{run_id}"},
                    headers={"Prefer": "return=minimal"},
                    json={
                        "status": status,
                        "error": error,
                        "finished_at": datetime.now(UTC).isoformat(),
                    },
                    timeout=30,
                ),
                "sync_runs",
            )
        except Exception as e:
            print(f"[garmin-sync] sync_runs : {e}", file=sys.stderr)


# Synchro -----------------------------------------------------------------------


def sync(garmin: Garmin, db: Supabase, user_id: str, days: int, today: date) -> tuple[int, int]:
    start = today - timedelta(days=days - 1)
    dates = [(start + timedelta(days=i)).isoformat() for i in range(days)]

    vo2 = vo2max_by_day(garmin.get_max_metrics_range(dates[0], dates[-1]))
    daily = [
        daily_row(user_id, d, garmin.get_user_summary(d), garmin.get_sleep_data(d), vo2.get(d))
        for d in dates
    ]

    activities = [
        row
        for activity in garmin.get_activities_by_date(dates[0], dates[-1])
        if isinstance(activity, dict) and (row := activity_row(user_id, activity))
    ]

    db.upsert("garmin_daily", daily, "user_id,day")
    db.upsert("garmin_activities", activities, "user_id,activity_id")
    return len(daily), len(activities)


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"[garmin-sync] variable manquante : {name}")
    return value


def main() -> int:
    user_id = env("SYNAPSE_USER_ID")
    db = Supabase(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"))
    email, password = env("GARMIN_EMAIL"), env("GARMIN_PASSWORD")
    tokenstore = os.environ.get("GARMIN_TOKENSTORE") or "~/.garminconnect"
    days = min(max(int(os.environ.get("GARMIN_SYNC_DAYS") or DEFAULT_DAYS), 1), MAX_DAYS)

    run_id = db.start_run(user_id)
    try:
        garmin = Garmin(email, password)
        # Jetons du cache s'ils sont valides, sinon connexion par mot de passe ;
        # dans les deux cas, les jetons à jour sont réécrits dans `tokenstore`.
        garmin.login(tokenstore)
        n_days, n_activities = sync(garmin, db, user_id, days, datetime.now(TIME_ZONE).date())
    except GarminConnectTooManyRequestsError as e:
        message = f"Garmin limite les connexions, nouvel essai au prochain passage : {e}"
    except GarminConnectAuthenticationError as e:
        message = f"Connexion Garmin refusée : {e}"
    except Exception as e:
        message = f"{type(e).__name__}: {e}"
    else:
        print(f"[garmin-sync] {n_days} jours, {n_activities} activités")
        db.finish_run(run_id, "success")
        return 0

    print(f"[garmin-sync] {message}", file=sys.stderr)
    db.finish_run(run_id, "error", message[:1000])
    return 1


if __name__ == "__main__":
    sys.exit(main())
