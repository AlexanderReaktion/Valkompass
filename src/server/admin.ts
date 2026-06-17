/** Admin-autentisering: kräver matchande x-admin-token mot ADMIN_TOKEN. */
export function requireAdmin(request: Request): Response | null {
  const token = request.headers.get("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return Response.json({ error: "Ej behörig." }, { status: 403 });
  }
  return null;
}
