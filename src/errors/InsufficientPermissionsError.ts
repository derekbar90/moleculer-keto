import { Errors, ActionParamTypes } from 'moleculer';

export class InsufficientPermissionsError extends Errors.MoleculerClientError {
  constructor(data: { [key: string]: ActionParamTypes }) {
    super('This account does not have enough permissions for this action.', 401, 'ERR_HAS_NO_PERMISSIONS', data);
  }
}

export default InsufficientPermissionsError;
