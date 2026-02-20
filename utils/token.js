import jwt from "jsonwebtoken";

const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  const token = jwt.sign({ userId }, secret, {
    expiresIn: "7d",
  });
  return token;
};

export default generateToken;
