import { StellarRouteBlacklistService } from './stellar-route-blacklist.service';

describe('StellarRouteBlacklistService', () => {
  let blacklist: StellarRouteBlacklistService;

  beforeEach(() => {
    blacklist = new StellarRouteBlacklistService();
  });

  it('should add and retrieve a blacklist entry', () => {
    const entry = blacklist.add('route-unsafe', { bridgeId: 'stellar-bridge', reason: 'unstable provider' });

    expect(entry.routeId).toBe('route-unsafe');
    expect(entry.reason).toBe('unstable provider');
    expect(blacklist.isBlacklisted('route-unsafe')).toBe(true);
    expect(blacklist.getEntry('route-unsafe')).toEqual(entry);
  });

  it('should remove a route from the blacklist', () => {
    blacklist.add('route-unsafe');

    expect(blacklist.remove('route-unsafe')).toBe(true);
    expect(blacklist.isBlacklisted('route-unsafe')).toBe(false);
  });

  it('should update an existing blacklist entry', () => {
    blacklist.add('route-unsafe', { reason: 'initial reason' });

    const updated = blacklist.update('route-unsafe', { reason: 'revised risk profile' });

    expect(updated).not.toBeNull();
    expect(updated?.reason).toBe('revised risk profile');
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(updated?.addedAt.getTime());
  });

  it('should filter out blacklisted routes from a route list', () => {
    blacklist.add('route-bad');
    const routes = [
      { routeId: 'route-ok', bridgeId: 'stellar-bridge' },
      { routeId: 'route-bad', bridgeId: 'stellar-bridge' },
    ];

    const filtered = blacklist.filterRoutes(routes);

    expect(filtered).toEqual([{ routeId: 'route-ok', bridgeId: 'stellar-bridge' }]);
  });

  it('should dispatch events when the blacklist changes', () => {
    const addedSpy = jest.fn();
    const removedSpy = jest.fn();
    const updatedSpy = jest.fn();

    blacklist.on('added', addedSpy);
    blacklist.on('removed', removedSpy);
    blacklist.on('updated', updatedSpy);

    blacklist.add('route-unsafe');
    blacklist.update('route-unsafe', { reason: 'new reason' });
    blacklist.remove('route-unsafe');

    expect(addedSpy).toHaveBeenCalledTimes(1);
    expect(updatedSpy).toHaveBeenCalledTimes(1);
    expect(removedSpy).toHaveBeenCalledTimes(1);
  });
});
