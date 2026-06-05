export const jwtConfig = () => ({
  secret: process.env.JWT_SECRET || 'supersecretjwtkey',
  expiresIn: process.env.JWT_EXPIRES_IN || '8h',
});
