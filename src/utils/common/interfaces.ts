import { Request } from 'express';

// Extends the Express Request type with a startTime property.
// Used by the logging middleware to track how long a request took to process.
// startTime is set to Date.now() when the request arrives.
export type RequestExt = Request & { startTime: number };
