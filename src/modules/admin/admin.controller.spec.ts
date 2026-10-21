import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

describe('AdminController', () => {
  let controller: AdminController;
  let admin: jest.Mocked<Pick<AdminService, 'listCategories' | 'listUsers'>>;

  beforeEach(async () => {
    admin = {
      listCategories: jest
        .fn()
        .mockReturnValue([{ id: 'technology', name: 'Technology', subcategories: ['AI'] }]),
      listUsers: jest
        .fn()
        .mockResolvedValue([
          { id: 1, email: 'a@b.c', fullName: 'A B', createdAt: new Date('2026-10-01T00:00:00Z') },
        ]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: admin }],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();

    controller = moduleRef.get(AdminController);
  });

  it('GET /admin/categories returns the catalog', () => {
    const result = controller.listCategories();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'technology', name: 'Technology' });
    expect(admin.listCategories).toHaveBeenCalled();
  });

  it('GET /admin/users returns a page of users', async () => {
    const result = await controller.listUsers();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 1, email: 'a@b.c' });
    expect(admin.listUsers).toHaveBeenCalled();
  });
});
