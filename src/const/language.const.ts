export const LANGUAGE = {
    JAVASCRIPT : 'javascript',
    PYTHON : 'python',
    GO : 'go'
} as const

export type Language = typeof LANGUAGE[keyof typeof LANGUAGE];