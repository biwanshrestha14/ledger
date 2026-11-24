import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { UserId } from '../common/auth';
import { COLOR_RE, assertOwned, camel, newId } from '../common/util';
import { DatabaseService } from '../db/database.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCategoryDto {
  @Transform(trim) @IsString() @Length(1, 40, { message: 'Enter a category name.' }) name: string;
  @IsIn(['expense', 'income']) kind: 'expense' | 'income';
  @Matches(COLOR_RE) color: string;
  @IsString() @Matches(/^[a-z0-9-]{1,40}$/) icon: string;
}

export class UpdateCategoryDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 40) name?: string;
  @IsOptional() @Matches(COLOR_RE) color?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,40}$/) icon?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(private db: DatabaseService) {}

  list(userId: string) {
    return this.db
      .all('SELECT * FROM categories WHERE user_id = ? ORDER BY kind DESC, archived, name COLLATE NOCASE', [userId])
      .map((r) => ({ ...camel(r), archived: !!r.archived }));
  }

  create(userId: string, dto: CreateCategoryDto) {
    const id = newId();
    this.db.run('INSERT INTO categories (id, user_id, name, kind, color, icon) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, dto.name, dto.kind, dto.color, dto.icon]);
    return this.list(userId).find((c: any) => c.id === id);
  }

  update(userId: string, id: string, dto: UpdateCategoryDto) {
    assertOwned(this.db, 'categories', id, userId, 'Category');
    const cur: any = this.list(userId).find((c: any) => c.id === id);
    this.db.run('UPDATE categories SET name = ?, color = ?, icon = ?, archived = ? WHERE id = ?', [
      dto.name ?? cur.name, dto.color ?? cur.color, dto.icon ?? cur.icon, (dto.archived ?? cur.archived) ? 1 : 0, id,
    ]);
    return this.list(userId).find((c: any) => c.id === id);
  }

  remove(userId: string, id: string) {
    assertOwned(this.db, 'categories', id, userId, 'Category');
    this.db.run('DELETE FROM categories WHERE id = ?', [id]);
  }
}

@Controller('categories')
export class CategoriesController {
  constructor(private svc: CategoriesService) {}
  @Get() list(@UserId() u: string) { return this.svc.list(u); }
  @Post() create(@UserId() u: string, @Body() dto: CreateCategoryDto) { return this.svc.create(u, dto); }
  @Patch(':id') update(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { this.svc.remove(u, id); }
}

@Module({ controllers: [CategoriesController], providers: [CategoriesService] })
export class CategoriesModule {}
