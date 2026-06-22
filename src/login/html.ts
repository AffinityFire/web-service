export const loginHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sign in</title>
    <style>
      :root {
        color-scheme: light dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        background: #f3f2f1;
        color: #1b1a19;
      }

      .card {
        background: #ffffff;
        padding: 2.5rem 2rem;
        border-radius: 8px;
        box-shadow:
          0 1.6px 3.6px rgba(0, 0, 0, 0.13),
          0 0.3px 0.9px rgba(0, 0, 0, 0.11);
        width: 100%;
        max-width: 360px;
        text-align: center;
      }

      h1 {
        font-size: 1.4rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
      }

      p {
        margin: 0 0 1.75rem;
        color: #605e5c;
        font-size: 0.95rem;
      }

      .ms-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.65rem;
        width: 100%;
        padding: 0.7rem 1rem;
        background: #2f2f2f;
        color: #ffffff;
        text-decoration: none;
        font-size: 0.95rem;
        font-weight: 600;
        border-radius: 4px;
        transition: background 0.15s ease;
      }

      .ms-button:hover {
        background: #1f1f1f;
      }

      .ms-logo {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
    </style>
  </head>

  <body>
    <main class="card">
      <h1>Sign in</h1>
      <p>Use your Microsoft account to continue.</p>
      <a class="ms-button" href="/auth/signin">
        <svg
          class="ms-logo"
          viewBox="0 0 21 21"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        Sign in with Microsoft
      </a>
    </main>
  </body>
</html>
`;
