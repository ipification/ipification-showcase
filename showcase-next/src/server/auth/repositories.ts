import { createSession, readSession } from "@/server/session/store";
import {
  saveResult,
  waitForResult,
  getUserInfo,
} from "@/server/store/auth-results";
import type { DisplayResult, SessionData, UserInfo } from "@/shared/contracts";
export interface SessionRepository {
  read(id: string): Promise<SessionData | null>;
  create(data: SessionData, previousId?: string): Promise<string>;
}
export interface AuthResultRepository {
  saveResult(
    state: unknown,
    result: DisplayResult,
    raw: UserInfo,
  ): Promise<void>;
  waitForResult(state?: unknown): Promise<DisplayResult | undefined>;
  getUserInfo(state?: unknown): Promise<UserInfo | undefined>;
}
export const sessionRepository: SessionRepository = {
  read: readSession,
  create: createSession,
};
export const authResultRepository: AuthResultRepository = {
  saveResult,
  waitForResult,
  getUserInfo,
};
