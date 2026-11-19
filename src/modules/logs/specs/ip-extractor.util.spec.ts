import {
  extractClientIp,
  extractCountryCode,
  extractUserAgent,
  normalizeIpAddress,
} from '../utils/ip-extractor.util';

describe('ip-extractor.util', () => {
  describe('normalizeIpAddress', () => {
    it('strips IPv4-mapped IPv6 prefix and ports', () => {
      expect(normalizeIpAddress('::ffff:203.0.113.5')).toBe('203.0.113.5');
      expect(normalizeIpAddress('198.51.100.7:54321')).toBe('198.51.100.7');
      expect(normalizeIpAddress('[2001:db8::1]:443')).toBe('2001:db8::1');
    });

    it('extracts the first IP from comma-separated X-Forwarded-For values', () => {
      expect(normalizeIpAddress('203.0.113.10, 10.0.0.1, 127.0.0.1')).toBe('203.0.113.10');
    });

    it('returns null for blank inputs', () => {
      expect(normalizeIpAddress('')).toBeNull();
      expect(normalizeIpAddress('   ')).toBeNull();
      expect(normalizeIpAddress(undefined)).toBeNull();
    });
  });

  describe('extractClientIp', () => {
    it('prioritizes CF-Connecting-IP over X-Real-IP, X-Forwarded-For and socket', () => {
      const ip = extractClientIp({
        headers: {
          'cf-connecting-ip': '198.51.100.42',
          'x-real-ip': '10.0.0.5',
          'x-forwarded-for': '10.0.0.5, 172.17.0.1',
        },
        ip: '127.0.0.1',
      });
      expect(ip).toBe('198.51.100.42');
    });

    it('falls back through X-Real-IP, X-Forwarded-For, req.ip and socket remoteAddress', () => {
      expect(
        extractClientIp({
          headers: { 'x-real-ip': '::ffff:203.0.113.8', 'x-forwarded-for': '10.0.0.1' },
        }),
      ).toBe('203.0.113.8');

      expect(
        extractClientIp({
          headers: { 'x-forwarded-for': '192.0.2.99, 10.0.0.2' },
        }),
      ).toBe('192.0.2.99');

      expect(extractClientIp({ headers: {}, ip: '::ffff:127.0.0.1' })).toBe('127.0.0.1');
      expect(extractClientIp({ headers: {}, socket: { remoteAddress: '::1' } })).toBe('::1');
    });
  });

  describe('extractUserAgent & extractCountryCode', () => {
    it('reads headers case-insensitively and bounds lengths', () => {
      const longUa = 'Mozilla/5.0 ' + 'x'.repeat(1200);
      expect(extractUserAgent({ headers: { 'User-Agent': longUa } })?.length).toBe(1000);
      expect(extractCountryCode({ headers: { 'CF-IPCountry': 'MX' } })).toBe('MX');
    });
  });
});
