const HTML_ACCEPT = 'text/html'

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)

    if (response.status !== 404) {
      return response
    }

    const acceptsHtml = request.headers.get('accept')?.includes(HTML_ACCEPT)
    if (request.method !== 'GET' || !acceptsHtml) {
      return response
    }

    const url = new URL(request.url)
    url.pathname = '/index.html'
    return env.ASSETS.fetch(new Request(url, request))
  },
}
