import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { DRIZZLE } from '../../database/database.tokens';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const db = { execute: jest.fn() };

  beforeEach(async () => {
    db.execute.mockReset().mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: DRIZZLE, useValue: db }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports liveness without querying PostgreSQL', async () => {
    const result = await controller.live();

    expect(result.data.status).toBe('ok');
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL responds to a query', async () => {
    const result = await controller.ready();

    expect(result.data.status).toBe('ok');
    expect(result.data.info?.['db']?.['status']).toBe('up');
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('fails readiness when PostgreSQL is unavailable', async () => {
    db.execute.mockRejectedValue(new Error('database unavailable'));

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
