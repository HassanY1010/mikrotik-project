import { PartialType } from '@nestjs/swagger';
import { CreatePortalTemplateDto } from './create-portal-template.dto';

export class UpdatePortalTemplateDto extends PartialType(CreatePortalTemplateDto) {}
