
const TYPES = {
    ICacheProvider : Symbol.for("ICacheProvider"),
    SocketManager : Symbol.for("SocketManager"),
    KafkaManager : Symbol.for("KafkaManager"),
    ISnapshotRepo : Symbol.for("ISnapshotRepo"),
    ISessionRepo : Symbol.for("ISessionRepo"),
    ISessionService : Symbol.for("ISessionService"),
    RedisService : Symbol.for("RedisService"),
    SessionHandler : Symbol.for("SessionHandler")
}

export default TYPES