export type ConnectorId = 'weather' | 'google' | 'garmin' | 'cairn' | 'meals'

export type ConnectorResult<T> = {
  data: T
  syncedAt: Date | null
  error?: string
}

export type Connector<T> = {
  id: ConnectorId
  read(userId: string): Promise<ConnectorResult<T>>
}
