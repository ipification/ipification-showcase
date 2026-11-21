import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { POST as readResult } from "./controller";

export const router = Router();
router.post("/auth/s2s/signin", adapt(readResult));
