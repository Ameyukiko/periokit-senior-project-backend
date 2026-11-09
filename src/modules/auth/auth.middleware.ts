import { NextFunction, Request, Response } from "express";
import { AppError } from "../../utils/errors";
import { authenticateAccessToken } from "./auth.identity";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorizationHeader = req.headers.authorization;
  const accessToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : null;

  if (!accessToken) {
    res.status(401).json({
      success: false,
      message: "Authorization bearer token is required",
    });
    return;
  }

  try {
    req.auth = await authenticateAccessToken(accessToken);

    next();
  } catch (error) {
    console.error("Authentication failed", error);

    const statusCode = error instanceof AppError ? error.statusCode : 401;
    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 403
          ? "User account is disabled"
          : "Invalid authentication token",
    });
  }
};
