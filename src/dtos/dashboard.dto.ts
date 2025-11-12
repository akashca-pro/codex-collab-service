
interface Session {
    active : number;
    ended : number;
    offline : number;
}

export interface ISessionStats {
    total : Session
    today : Session
}