export interface InviteTokenPayload {   
    sessionId : string;
    ownerId : string;
}

export interface AccessTokenPayload {
    userId : string;
    email : string;
    role : string;
    accessTokenId : string;
    accessTokenExp : string;
}