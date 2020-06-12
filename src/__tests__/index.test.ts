import { UnableToComputerEntityIdError } from '../errors/UnableToComputerEntityIdError';
import { InsufficientPermissionsError } from '../errors/InsufficientPermissionsError';
import { MissingUserContextError } from '../errors/MissingUserContextError';

describe('UnableToComputerEntityIdError', () => {
  const expectThis = new UnableToComputerEntityIdError({});

  it('can instantiate error', () => expect(expectThis).toBeInstanceOf(UnableToComputerEntityIdError));
});

describe('InsufficientPermissionsError', () => {
  const expectThis = new InsufficientPermissionsError({});

  it('can instantiate error', () => expect(expectThis).toBeInstanceOf(InsufficientPermissionsError));
});

describe('MissingUserContextError', () => {
  const expectThis = new MissingUserContextError({});

  it('can instantiate error', () => expect(expectThis).toBeInstanceOf(MissingUserContextError));
});
