import { Request } from 'express';

export type RequestExt = Request & { startTime: number };
