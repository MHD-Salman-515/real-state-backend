import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class TrackOutcomeDto {
  @IsString()
  @IsNotEmpty()
  log_id!: string;

  @IsString()
  @IsIn([
    'accepted_optimal',
    'accepted_fast',
    'accepted_balanced',
    'accepted_profit',
    'edited',
    'ignored',
  ])
  action!:
    | 'accepted_optimal'
    | 'accepted_fast'
    | 'accepted_balanced'
    | 'accepted_profit'
    | 'edited'
    | 'ignored';

  @IsNotEmpty()
  final_price_syp!: string | number;
}
