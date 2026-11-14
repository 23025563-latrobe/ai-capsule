export async function apiRequest(path, { body, ...options } = {}) {
  let response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error(
      'Unable to reach AI Capsule. Check your connection and try again.',
      { cause: error }
    )
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(
      new Error(
        response.status === 401
          ? 'Your session has ended. Sign in again to continue.'
          : data?.error ||
              'The request could not be completed. Please try again.'
      ),
      {
        status: response.status,
        details: data?.details || []
      }
    )
  }
  if (!data)
    throw new Error(
      'The server returned an unreadable response. Please try again.'
    )
  return data
}
