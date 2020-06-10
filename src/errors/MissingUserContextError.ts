import { Errors, ActionParamTypes } from 'moleculer';

export default class MissingUserContextError extends Errors.MoleculerClientError {
  constructor(data: { [key: string]: ActionParamTypes }) {
    super('You have not provided the appropriate access token for this resource.', 401, 'ERR_HAS_NO_ACCESS', data);
  }
}
