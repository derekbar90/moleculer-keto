import { Errors, ActionParamTypes } from 'moleculer';

export class MissingUserContextError extends Errors.MoleculerClientError {
  constructor(data: { [key: string]: ActionParamTypes }) {
    super(
      `You have not provided the appropriate access token for the resource ${data.action}.`,
      401,
      'ERR_HAS_NO_ACCESS',
      data
    );
  }
}

export default MissingUserContextError;
