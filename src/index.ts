import { ServiceSchema, Context, Errors, ActionHandler, ActionParams, Middleware } from 'moleculer';
import fetch from 'node-fetch';
import { camelCase } from 'change-case';
import { UnableToComputerEntityIdError } from './errors/UnableToComputerEntityIdError';
import { MissingUserContextError } from './errors/MissingUserContextError';
import { InsufficientPermissionsError } from './errors/InsufficientPermissionsError';

export type OryAccessControlPolicyAllowedInput = {
  action: string;
  context?: { [key: string]: unknown };
  resource: string;
  subject: string;
};

type PermissionConfig = {
  subject: string;
  action: string;
  flavor: string;
};

type OryAccessControlPolicyRequest = OryAccessControlPolicyAllowedInput & {
  flavor: string;
};

export const KetoMiddeware: Middleware = {
  // For more info on this wrapper: https://moleculer.services/docs/0.14/middlewares.html#localAction-next-action
  localAction: (next: ActionHandler, action: ActionParams) => {
    // Helper function which will call the isEntityOwner
    const isEntityOwner = async (ctx: Context): Promise<boolean> => {
      if (typeof ctx.service?.isEntityOwner === 'function') {
        const allowed = await ctx.service?.isEntityOwner.call(this, ctx);
        return allowed;
      }

      throw new Errors.MoleculerServerError(
        'You are missing the isEntityOwner action on this service',
        500,
        'ERR_ACCESS_CTRL_OWNER_HANDLER_MISSING',
        { action: action.name }
      );
    };
    // If this feature enabled
    if (action.permissions) {
      const actionPermissions: PermissionConfig[] = [];

      // permFuncs will hold async permissions which
      // will be executed per call to the ACL service.
      const permFuncs: ((ctx: Context) => Promise<boolean>)[] = [];

      // Check if permissions are in an array and if not, put them in one for parsing
      const permissions: PermissionConfig[] = Array.isArray(action.permissions)
        ? action.permissions
        : [action.permissions];

      // Here we sort the permissions
      // We will also execute the $owner
      // eslint-disable-next-line no-restricted-syntax
      for (const permission of permissions) {
        if (typeof permission === 'function') {
          permFuncs.push(permission);
        }

        if (typeof permission === 'object') {
          if (permission.subject === '$owner') {
            // Check if user is owner of the entity
            permFuncs.push(isEntityOwner);
          }
          // Add role or permission name
          actionPermissions.push(permission);
        }
      }

      return async (
        ctx: Context<{ id?: string }, { roles: string[]; user: { [key: string]: unknown } } & ActionParams>
      ) => {
        const { meta } = ctx;
        const { user } = meta;
        const { roles } = meta;
        if (user === undefined || user == null) {
          throw new MissingUserContextError({ action: action.name });
        }

        if (roles) {
          let res = false;

          if (actionPermissions.length > 0) {
            let allowed = false;

            const preppedActionPermissions: Array<OryAccessControlPolicyRequest> = [];

            // eslint-disable-next-line no-restricted-syntax
            for (const actionPermission of actionPermissions) {
              // Add Permission Request for the user context on the service resource
              preppedActionPermissions.push({
                action: `actions:${process.env.ROOT_ORG_IDENTIFIER}:${actionPermission.action}`,
                subject: `subjects:${process.env.ROOT_ORG_IDENTIFIER}:${user.id}`,
                resource: `resources:${process.env.ROOT_ORG_IDENTIFIER}:${String(action.name).split('.')[1]}`,
                flavor: actionPermission.flavor,
              });
              // Add Permission Request for the user context on the specific resource by id
              if (ctx.params.id) {
                preppedActionPermissions.push({
                  action: `actions:${process.env.ROOT_ORG_IDENTIFIER}:${actionPermission.action}`,
                  subject: `subjects:${process.env.ROOT_ORG_IDENTIFIER}:${user.id}`,
                  resource: `resources:${process.env.ROOT_ORG_IDENTIFIER}:${ctx.params.id}`,
                  flavor: actionPermission.flavor,
                });
              }
            }

            // eslint-disable-next-line no-restricted-syntax
            for (const perm of preppedActionPermissions) {
              const body: OryAccessControlPolicyAllowedInput = {
                action: perm.action,
                subject: perm.subject,
                resource: perm.resource,
              };

              // eslint-disable-next-line no-await-in-loop
              const ketoResponse = await fetch(
                `${process.env.KETO_ADMIN_URL}/engines/acp/ory/${[perm.flavor]}/allowed`,
                {
                  method: 'post',
                  body: JSON.stringify(body),
                  headers: { 'Content-Type': 'application/json' },
                }
              );

              const isPermissionAllowed = ketoResponse
                ? // eslint-disable-next-line no-await-in-loop
                  await ketoResponse.json()
                : {
                    allowed: false,
                  };

              if (isPermissionAllowed.allowed) {
                allowed = true;
              }
            }
            res = allowed;
          }
          if (res !== true) {
            if (permFuncs.length > 0) {
              // PromiseConstructorLike does not contain all method but the actual Promise does
              const results = await Promise.all(permFuncs.map(async (fn) => fn.call(this, ctx)));
              res = results.find((r: boolean) => !!r);
            }

            if (res !== true) {
              throw new InsufficientPermissionsError({ action: action.name });
            }
          }
        }

        // Call the handler
        return next(ctx);
      };
    }

    // Return original handler, because feature is disabled
    return next;
  },
};

export const IsOwnerMixin = (typeName: string, ownerKey = 'owner'): ServiceSchema => {
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

export const ManageKetoPermissionsMiddleware: Middleware = {
  localAction: (next: ActionHandler, action: ActionParams) => {
    return async (ctx: Context<unknown, { user: { id: string } }>) => {
      const actionName = String(action.name).split('.').pop();
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      const calledActionDetails = action.service.originalSchema.actions[actionName];

      if (calledActionDetails === undefined || calledActionDetails.permissions === undefined) {
        return next(ctx);
      }

      const providedPermissionedActions = calledActionDetails.permissions.map(
        (permission: { subject: string; action: string; flavor: string }) => permission.action
      );

      const { user } = ctx.meta;

      if (user === undefined) {
        return next(ctx);
      }

      const distinctActions = [...new Set(providedPermissionedActions)] as Array<string>;

      const policyId = `user:${user.id}:${
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        action.service.name
      }`;

      const getCurrentRoles = await fetch(
        `${process.env.KETO_ADMIN_URL}/engines/acp/ory/${['exact']}/policies/${policyId}`,
        {
          method: 'get',
        }
      );
      const currentRole: {
        id: string;
        description: string;
        subjects: Array<string>;
        effect: string;
        actions: Array<string>;
        resources: Array<string>;
      } = await getCurrentRoles.json();

      return next(ctx)
        .then(async (res: { [key: string]: string }) => {
          // this should add update ability because create
          // should be added on the role of the user for the
          // action of the service in the keto config files already
          const currentResource = `${process.env.KETO_RESOURCE_PREFIX}${res.id}`;
          const resources = [currentResource];
          const body = {
            id: policyId,
            description: 'This policy provides access control for the users service',
            subjects: [`${process.env.KETO_SUBJECT_PREFIX}${user.id}`],
            effect: 'allow',
            actions: [
              `${process.env.KETO_ACTION_PREFIX}read`,
              `${process.env.KETO_ACTION_PREFIX}update`,
              `${process.env.KETO_ACTION_PREFIX}delete`,
            ],
            resources,
          };
          // If there is a current role with resouces associated then
          // lets make sure add those resources are added to the new upsert
          if (Object.keys(currentRole).length > 0 && currentRole.resources.length > 0) {
            // eslint-disable-next-line no-restricted-syntax
            for (const resource of currentRole.resources) {
              body.resources.push(resource);
            }
          }
          // eslint-disable-next-line no-restricted-syntax
          for (const providedPermission of distinctActions) {
            switch (providedPermission) {
              case 'create':
                // Upsert Policy
                // eslint-disable-next-line no-await-in-loop
                await fetch(`${process.env.KETO_ADMIN_URL}/engines/acp/ory/exact/policies`, {
                  method: 'put',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                break;
              case 'update':
                break;
              case 'delete':
                // If there is a current role with resouces associated then
                // lets make sure not replace but filter out the current
                // resource we are removing form the policy
                if (Object.keys(currentRole).length > 0 && currentRole.resources.length > 1) {
                  // Because we already added the resource before the for
                  // loop and switch we should be removing two entries from
                  // the array fot he current resource id
                  body.resources = body.resources.filter((resource) => resource !== currentResource);
                  // eslint-disable-next-line no-await-in-loop
                  await fetch(`${process.env.KETO_ADMIN_URL}/engines/acp/ory/exact/policies`, {
                    method: 'put',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  });
                } else if (Object.keys(currentRole).length > 0) {
                  // This would mean that we have
                  // eslint-disable-next-line no-await-in-loop
                  await fetch(`${process.env.KETO_ADMIN_URL}/engines/acp/ory/${['exact']}/policies/${policyId}`, {
                    method: 'delete',
                  });
                }
                break;
              default:
                break;
            }
          }
          return res;
        })
        .catch((err: Error) => {
          throw err;
        });
    };
  },
};

export { UnableToComputerEntityIdError, InsufficientPermissionsError, MissingUserContextError };

export default {
  KetoMiddeware,
  IsOwnerMixin,
  ManageKetoPermissionsMiddleware,
};
