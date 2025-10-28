import mongoose from "mongoose";
import { config } from ".";
import logger from '@/utils/pinoLogger';

export const connectDB = () =>{
    mongoose.connect(config.COLLAB_SERVICE_DATABASE_URL)
    .then(()=> logger.info('Connected to MongoDB'))
    .catch((err)=>logger.error('MongoDB connection error',err));
}
