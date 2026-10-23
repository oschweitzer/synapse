"""Tests de la lecture des réponses Garmin : `python -m unittest jobs/garmin/test_sync.py`."""

import unittest

from sync import activity_row, daily_row, vo2max_by_day

USER = "00000000-0000-0000-0000-000000000001"


class DailyRowTest(unittest.TestCase):
    def test_full_day(self):
        summary = {
            "totalSteps": 8421,
            "dailyStepGoal": 7500,
            "restingHeartRate": 51,
            "bodyBatteryAtWakeTime": 78,
            "bodyBatteryHighestValue": 80,
            "bodyBatteryLowestValue": 22,
        }
        sleep = {
            "dailySleepDTO": {
                "sleepTimeSeconds": 26400,
                "deepSleepSeconds": 5400,
                "lightSleepSeconds": 14400,
                "remSleepSeconds": 6600,
                "awakeSleepSeconds": 900,
                "sleepStartTimestampGMT": 1792706400000,
                "sleepEndTimestampGMT": 1792733700000,
                "sleepScores": {"overall": {"value": 83}},
            },
            "bodyBatteryChange": 56,
        }
        row = daily_row(USER, "2026-10-23", summary, sleep, 48.5)
        self.assertEqual(row["steps"], 8421)
        self.assertEqual(row["sleep_seconds"], 26400)
        self.assertEqual(row["sleep_score"], 83)
        self.assertEqual(row["body_battery_charged"], 56)
        self.assertEqual(row["body_battery_at_wake"], 78)
        self.assertEqual(row["resting_hr"], 51)
        self.assertEqual(row["vo2max"], 48.5)
        self.assertEqual(row["sleep_start_at"], "2026-10-22T22:00:00+00:00")

    def test_missing_data_gives_nulls(self):
        row = daily_row(USER, "2026-10-23", {}, {"dailySleepDTO": {"sleepTimeSeconds": None}}, None)
        self.assertIsNone(row["sleep_seconds"])
        self.assertIsNone(row["steps"])
        self.assertIsNone(row["sleep_start_at"])
        self.assertIsNone(daily_row(USER, "2026-10-23", None, None, None)["resting_hr"])

    def test_resting_hr_falls_back_to_sleep(self):
        row = daily_row(USER, "2026-10-23", {}, {"restingHeartRate": 49}, None)
        self.assertEqual(row["resting_hr"], 49)


class Vo2maxTest(unittest.TestCase):
    def test_precise_value_first(self):
        metrics = [
            {"generic": {"calendarDate": "2026-10-22", "vo2MaxPreciseValue": 48.3, "vo2MaxValue": 48}},
            {"generic": {"calendarDate": "2026-10-23", "vo2MaxValue": 49}},
            {"generic": None, "cycling": {"vo2MaxValue": 50}},
        ]
        self.assertEqual(vo2max_by_day(metrics), {"2026-10-22": 48.3, "2026-10-23": 49.0})
        self.assertEqual(vo2max_by_day({}), {})


class ActivityRowTest(unittest.TestCase):
    def test_activity(self):
        row = activity_row(
            USER,
            {
                "activityId": 17234567890,
                "activityName": "Course à pied",
                "activityType": {"typeKey": "running"},
                "startTimeGMT": "2026-10-22 16:30:05",
                "duration": 2712.4,
                "distance": 8012.3,
                "averageHR": 148.0,
                "maxHR": 171.0,
                "elevationGain": 64.0,
                "calories": 612.0,
            },
        )
        self.assertEqual(row["activity_id"], 17234567890)
        self.assertEqual(row["activity_type"], "running")
        self.assertEqual(row["start_at"], "2026-10-22T16:30:05+00:00")
        self.assertEqual(row["avg_hr"], 148)

    def test_unusable_activity_is_skipped(self):
        self.assertIsNone(activity_row(USER, {"activityName": "?"}))
        self.assertIsNone(activity_row(USER, {"activityId": 1, "startTimeGMT": "n/a"}))


if __name__ == "__main__":
    unittest.main()
