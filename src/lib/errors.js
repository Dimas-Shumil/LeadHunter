export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = (message) => {
  throw new HttpError(400, message);
};
