import { isSystemRefreshing } from "../utils/refreshData.js";

// Middleware - refresh jarayoni davom etayotganini tekshirish
export const checkRefreshStatus = (req, res, next) => {
  if (isSystemRefreshing()) {
    return res.status(503).json({
      status: "error",
      message:
        "Tizimda yangilanish jarayoni davom etmoqda. Iltimos, keyinroq urinib ko'ring.",
      isRefreshing: true,
    });
  }
  next();
};
