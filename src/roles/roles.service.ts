import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rol } from './entities/rol.entity';

// Solo lectura: ver RolesController.
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Rol)
    private readonly repository: Repository<Rol>,
  ) {}

  findAll(): Promise<Rol[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<Rol> {
    const rol = await this.repository.findOne({ where: { idRol: id } });
    if (!rol) {
      throw new NotFoundException(`Rol ${id} no encontrado`);
    }
    return rol;
  }
}
