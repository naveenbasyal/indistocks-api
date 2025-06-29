import { verifyToken } from "../utils/jwt";

type DecodedToken = {
  id: string;
  email: string;
  plan: string;
  role: "user" | "admin" | "superadmin";
  iat: number;
  exp: number;
};

export const authMiddleware = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token missing or invalid",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token) as DecodedToken;

    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

export const requiresStaffMember = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token missing or invalid",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token) as DecodedToken;

    if (decoded.role !== "admin" && decoded.role !== "superadmin") {
      return res.status(401).json({
        success: false,
        message: "Access denied",
      });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};
