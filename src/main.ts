import { Either, fromPromise, ap, right, getOrElse, flatten, left } from './fp/either';
import { pipe } from './fp/utils';
import { fetchClient, fetchExecutor } from './fetching';
import { ClientUser, Demand, ExecutorUser } from './types';
import { distance } from './utils';
import { fromNullable, isNone, isSome } from './fp/maybe';
import { sort } from './fp/array';


type Response<R> = Promise<Either<string, R>>

const getExecutor = (): Response<ExecutorUser> => fromPromise(fetchExecutor());
const getClients = (): Response<Array<ClientUser>> => fromPromise(fetchClient()) as Response<Array<ClientUser>>

export enum SortBy {
  distance = 'distance',
  reward = 'reward',
}


export const show = (sortBy: SortBy) => (clients: Array<ClientUser>) => (executor: ExecutorUser): Either<string, string> => {
  // Sort clients by the specified sort option
  const compareClients = (a: ClientUser, b: ClientUser): number => {
    if (sortBy === SortBy.reward) {
      return b.reward - a.reward;
    } else if (sortBy === SortBy.distance) {
      const distanceA = distance(a.position, executor.position);
      const distanceB = distance(b.position, executor.position);
      return distanceA - distanceB;
    } else {
      throw new Error(`Invalid sort option: ${sortBy}`);
    }
  };

  const sortedClients = clients.sort(compareClients);

  // Check which clients' demands can be met by the executor
  const metClients = sortedClients.filter(client => {
    if (!client.demands) {
      return true; // If the client has no demands, the executor can always meet them
    }
    const clientDemands = client.demands._tag === 'Some' ? client.demands.value : [];
    return clientDemands.every(demand => executor.possibilities.includes(demand));
  });

  // Calculate how many clients the executor can meet the demands of
  const numClients = metClients.length;
  const numTotalClients = sortedClients.length;

  // Build the result string
  let result = '';
  if (numClients === numTotalClients) {
    result = 'This executor meets all demands of all clients!\n\n';
  } else if (numClients === 0) {
    result = 'This executor cannot meet any client demands.\n\n';
  } else {
    result = `This executor meets the demands of only ${numClients} out of ${numTotalClients} clients\n\n`;

    // Build a table of the clients whose demands can be met by the executor
    const tableHeader = sortBy === SortBy.reward ? 'Available clients sorted by highest reward:\n' : 'Available clients sorted by distance to executor:\n';
    const tableRows = metClients.map(client => `name: ${client.name}, distance: ${distance(client.position, executor.position).toFixed(3)}, reward: ${client.reward}`);
    const table = tableHeader + tableRows.join('\n');

    result += table;
  }

  // Return the result as an Either
  return numClients === 0 ? left('This executor cannot meet the demands of any client!') : right(result);
};







export const main = (sortBy: SortBy): Promise<string> => (
  Promise
    .all([getClients(), getExecutor()]) // Fetch clients and executor
    .then(([clients, executor]) => (
      pipe(
        /**
         * Since the "show" function takes two parameters, the value of which is inside Either
         * clients is Either<string, Array<Client>>, an executor is Either<string, Executor>. How to pass only Array<Client> and Executor to the show?
         * Either is an applicative type class, which means that we can apply each parameter by one
         */
        right(show(sortBy)), // Firstly, we need to lift our function to the Either
        ap(clients), // Apply first parameter
        ap(executor), // Apply second parameter
        flatten, // show at the end returns Either as well, so the result would be Either<string, Either<string, string>>. We need to flatten the result
        getOrElse((err) => err) // In case of any left (error) value, it would be stopped and show error. So, if clients or executor is left, the show would not be called, but onLeft in getOrElse would be called
      )
    ))
);
