export function apiError(message: string) {
  return {
    success: false,
    message,
    data: null,
    error: message,
  };
}
