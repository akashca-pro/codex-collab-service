export const STATUS = {
    ACTIVE : 'active',
    ENDED : 'ended',
    OFFLINE : 'offline'
} as const

export type Status = typeof STATUS[keyof typeof STATUS];