function renderBody(status, content) {
    const html = `
    <script>
      const receiveMessage = (message) => {
        window.opener.postMessage(
          'authorization:github:${status}:${JSON.stringify(content)}',
          message.origin
        );
        window.removeEventListener("message", receiveMessage, false);
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");
    </script>
    `;
    const blob = new Blob([html]);
    return blob;
}

function htmlResponse(status, body) {
    return new Response(body, {
        headers: {
            'content-type': 'text/html;charset=UTF-8',
            'cache-control': 'no-store',
        },
        status,
    });
}

export async function handleCallback(request, env) {
    const client_id = env.GITHUB_CLIENT_ID;
    const client_secret = env.GITHUB_CLIENT_SECRET;

    try {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        if (!code) {
            return new Response('missing code parameter', { status: 400 });
        }
        const response = await fetch(
            'https://github.com/login/oauth/access_token',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'user-agent': 'arc-community-website-oauth',
                    'accept': 'application/json',
                },
                body: JSON.stringify({ client_id, client_secret, code }),
            },
        );
        const result = await response.json();
        if (result.error) {
            return htmlResponse(401, renderBody('error', result));
        }
        const token = result.access_token;
        const provider = 'github';
        const responseBody = renderBody('success', {
            token,
            provider,
        });
        return htmlResponse(200, responseBody);

    } catch (error) {
        console.error(error);
        return htmlResponse(500, 'Internal Server Error');
    }
}
