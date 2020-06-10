import { ServiceSchema } from 'moleculer';
import { camelCase } from 'change-case';
import UnableToComputerEntityIdError from './errors/UnableToComputerEntityIdError';

export default (typeName: string, ownerKey = 'owner'): ServiceSchema => {
  return {
    name: '',
    methods: {
      /**
       * Internal method to check the owner of entity. (called from Permission middleware)
       *
       * @param {Context} ctx
       * @returns {Promise<Boolean>}
       */
      async isEntityOwner(ctx) {
        // First try and get the params out of the direct params
        let entityId = ctx.params.id;

        // Seconds try and get the params out based on the typename of the
        if (entityId === undefined) {
          // Using pascal case becaue that is what is used in the graphql mixin which provides the params defs
          entityId = ctx.params[camelCase(typeName)]?.id;
        }

        // If unable to find the entities id then throw an error
        if (entityId === undefined) {
          throw new UnableToComputerEntityIdError({ action: ctx.action.name });
        }

        // eslint-disable-next-line no-underscore-dangle
        const entity = await this._get(ctx, {
          id: entityId,
        });

        return !!(entity[ownerKey] === ctx.meta?.user?.id);
      },
    },
  };
};
