import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { UserId } from '../common/auth';
import { COLOR_RE, DATE_RE, assertOwned, camel, newId } from '../common/util';
import { DatabaseService } from '../db/database.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateGoalDto {
  @Transform(trim) @IsString() @Length(1, 60, { message: 'Enter a goal name.' }) name: string;
  @IsInt() @Min(1, { message: 'Enter a target greater than zero.' }) @Max(1e13) target: number;
  @IsOptional() @IsInt() @Min(0) @Max(1e13) saved?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE_RE) targetDate?: string | null;
  @Matches(COLOR_RE) color: string;
}
export class UpdateGoalDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1e13) target?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1e13) saved?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE_RE) targetDate?: string | null;
  @IsOptional() @Matches(COLOR_RE) color?: string;
}
export class ContributeDto {
  @IsInt() @Min(-1e13) @Max(1e13) amount: number;
}

@Injectable()
export class GoalsService {
  constructor(private db: DatabaseService) {}
  list(userId: string) {
    return this.db.all('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at', [userId]).map(camel);
  }
  private one(userId: string, id: string) {
    assertOwned(this.db, 'goals', id, userId, 'Goal');
    return camel<any>(this.db.get('SELECT * FROM goals WHERE id = ?', [id])!);
  }
  create(userId: string, d: CreateGoalDto) {
    const id = newId();
    this.db.run('INSERT INTO goals (id, user_id, name, target, saved, target_date, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, d.name, d.target, d.saved ?? 0, d.targetDate ?? null, d.color]);
    return this.one(userId, id);
  }
  update(userId: string, id: string, d: UpdateGoalDto) {
    const c = this.one(userId, id);
    this.db.run('UPDATE goals SET name=?, target=?, saved=?, target_date=?, color=? WHERE id=?', [
      d.name ?? c.name, d.target ?? c.target, d.saved ?? c.saved,
      d.targetDate !== undefined ? d.targetDate : c.targetDate, d.color ?? c.color, id,
    ]);
    return this.one(userId, id);
  }
  contribute(userId: string, id: string, amount: number) {
    this.one(userId, id);
    this.db.run('UPDATE goals SET saved = MAX(0, saved + ?) WHERE id = ?', [amount, id]);
    return this.one(userId, id);
  }
  remove(userId: string, id: string) {
    this.one(userId, id);
    this.db.run('DELETE FROM goals WHERE id = ?', [id]);
  }
}

@Controller('goals')
export class GoalsController {
  constructor(private svc: GoalsService) {}
  @Get() list(@UserId() u: string) { return this.svc.list(u); }
  @Post() create(@UserId() u: string, @Body() d: CreateGoalDto) { return this.svc.create(u, d); }
  @Patch(':id') update(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateGoalDto) { return this.svc.update(u, id, d); }
  @Post(':id/contribute') @HttpCode(200) contribute(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() d: ContributeDto) { return this.svc.contribute(u, id, d.amount); }
  @Delete(':id') @HttpCode(204) remove(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { this.svc.remove(u, id); }
}

@Module({ controllers: [GoalsController], providers: [GoalsService] })
export class GoalsModule {}
