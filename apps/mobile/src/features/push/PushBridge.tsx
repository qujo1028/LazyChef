// P6 W4 fills this in. Mounted once in the root layout, inside the providers, for signed-in
// people with a household. It owns: re-registering an already-allowed device on launch and
// resume (never asking for permission here), the foreground handler (an in-app toast instead
// of a banner), and tap deep links (core pushTapRoute, including a tap that cold-starts the app).
export function PushBridge() {
  return null;
}
