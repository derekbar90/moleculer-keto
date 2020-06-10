import { Errors, ActionParamTypes } from 'moleculer';

export default class UnableToComputerEntityIdError extends Errors.MoleculerClientError {
  constructor(data: { [key: string]: ActionParamTypes }) {
    super('Entity id unable to be computed from params.', 500, 'ERR_UNABLE_TO_COMPUTE_ENTITY_ID', data);
  }
}
