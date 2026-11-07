import { Test } from '@nestjs/testing';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { Reading } from '../../database/drizzle/types';

describe('ContentController', () => {
  let controller: ContentController;
  let content: jest.Mocked<Pick<ContentService, 'generate'>>;
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };
  const reading: Partial<Reading> = {
    id: 1,
    userId: 42,
    title: 'Sample reading',
    content: 'Lorem ipsum',
    category: 'technology',
    difficulty: 'medium',
    status: 'pending',
  };

  beforeEach(async () => {
    content = {
      generate: jest.fn().mockResolvedValue(reading),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [{ provide: ContentService, useValue: content }],
    }).compile();

    controller = moduleRef.get(ContentController);
  });

  it('delegates generation to ContentService and envelops the response', async () => {
    const result = await controller.generate(user, {
      category: 'technology',
      difficulty: 'medium',
    });
    expect(result.message).toBe('Reading generated successfully');
    expect(result.data).toEqual(reading);
    expect(content.generate).toHaveBeenCalledWith(42, {
      category: 'technology',
      difficulty: 'medium',
    });
  });

  it('accepts an empty body (all defaults)', async () => {
    const result = await controller.generate(user, {});
    expect(result.data).toEqual(reading);
    expect(content.generate).toHaveBeenCalledWith(42, {});
  });
});
