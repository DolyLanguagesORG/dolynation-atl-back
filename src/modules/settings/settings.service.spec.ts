import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { DrizzleDb } from '../../database/database.module';
import type { CategoryModerationService } from '../moderation/category-moderation.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let onConflictDoUpdate: jest.Mock;
  let values: jest.Mock;
  let db: { insert: jest.Mock };
  let moderation: jest.Mocked<Pick<CategoryModerationService, 'assertCategoriesAllowed'>>;
  let service: SettingsService;

  beforeEach(() => {
    onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    db = {
      insert: jest.fn().mockReturnValue({ values }),
    };
    moderation = {
      assertCategoriesAllowed: jest
        .fn()
        .mockImplementation((cats: readonly string[]) => Promise.resolve([...cats])),
    };

    service = new SettingsService(
      db as unknown as DrizzleDb,
      moderation as unknown as CategoryModerationService,
    );
  });

  it('moderates, normalizes, persists and returns allowed categories', async () => {
    moderation.assertCategoriesAllowed.mockResolvedValueOnce(['technology', 'Día de Muertos']);

    const result = await service.setCategories(42, ['  Technology ', 'Día de Muertos']);

    expect(moderation.assertCategoriesAllowed).toHaveBeenCalledWith([
      '  Technology ',
      'Día de Muertos',
    ]);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        preferredCategories: ['technology', 'Día de Muertos'],
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['technology', 'Día de Muertos']);
  });

  it('aborts persistence and propagates CATEGORY_MODERATION_REJECTED when moderation rejects', async () => {
    const error = new AppHttpException(ErrorCode.CATEGORY_MODERATION_REJECTED, {
      rejected: [
        { category: 'm u e r t o', layer: 'blacklist', reason: 'sensitive_death_or_violence_term' },
      ],
    });
    moderation.assertCategoriesAllowed.mockRejectedValueOnce(error);

    let caught: AppHttpException | null = null;
    try {
      await service.setCategories(42, ['m u e r t o']);
    } catch (err) {
      caught = err as AppHttpException;
    }

    expect(caught).toBeInstanceOf(AppHttpException);
    expect(caught?.getStatus()).toBe(400);
    expect(caught?.getResponse()).toMatchObject({
      code: ErrorCode.CATEGORY_MODERATION_REJECTED,
    });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
