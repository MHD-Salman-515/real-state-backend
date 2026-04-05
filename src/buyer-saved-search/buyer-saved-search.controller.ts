import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateBuyerSavedSearchDto } from './dto/create-buyer-saved-search.dto';
import { BuyerSavedSearchService } from './buyer-saved-search.service';

@ApiTags('buyer-saved-searches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
@Controller('buyer/saved-searches')
export class BuyerSavedSearchController {
  constructor(private readonly buyerSavedSearchService: BuyerSavedSearchService) {}

  @Post()
  @ApiOperation({ summary: 'Create buyer saved search (upsert by filters hash)' })
  @ApiOkResponse({ description: 'Saved search created or existing returned' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Buyer role is required' })
  async create(
    @Body() body: CreateBuyerSavedSearchDto,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    return this.buyerSavedSearchService.create({
      buyerId: this.getBuyerId(req),
      body,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List current buyer saved searches' })
  @ApiOkResponse({ description: 'Saved searches list' })
  async list(@Req() req?: { user?: { sub?: number | string } }) {
    return this.buyerSavedSearchService.list(this.getBuyerId(req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete buyer saved search by id (owner only)' })
  @ApiOkResponse({ description: 'Delete status' })
  async remove(
    @Param('id') id: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const searchId = Number(id);
    if (!Number.isInteger(searchId) || searchId <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }

    return this.buyerSavedSearchService.remove({
      buyerId: this.getBuyerId(req),
      id: searchId,
    });
  }

  private getBuyerId(req?: { user?: { sub?: number | string } }): number {
    const parsed = Number(req?.user?.sub);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid buyer id');
    }
    return parsed;
  }
}
