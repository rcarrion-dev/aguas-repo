import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ROL, Roles } from '../auth/roles';
import { RolesService } from './roles.service';

// Catálogo de roles: SOLO LECTURA, y solo administrador.
// Los permisos de toda la API comparan el NOMBRE del rol ('administrador',
// 'SSC', 'usuario'). Si se pudiera renombrar o borrar un rol por la API, un
// solo PATCH rompería el control de acceso de todo el sistema. Los roles se
// definen en 4Fantasticos_base_datos.sql.
@Roles(ROL.ADMIN)
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
