import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Bitacora } from '../../bitacora/entities/bitacora.entity';
import { Evidencia } from '../../evidencia/entities/evidencia.entity';

// Debe coincidir exactamente con el CHECK que se agregue en MySQL (estado)
export enum EstadoReporte {
  PENDIENTE = 'pendiente',
  VERIFICADO = 'verificado',
  RECHAZADO = 'rechazado',
}

// El proyecto ya solo maneja un tipo de caso (phishing/spoofing), así que
// no existe más el concepto de "tipo de fraude" — un Reporte ya es, por
// definición, ese tipo de caso. Ver tipos-fraude retirado del proyecto.
@Entity('reporte')
export class Reporte {
  @PrimaryGeneratedColumn({ name: 'id_reporte' })
  idReporte: number;

  @ManyToOne(() => Usuario, (usuario) => usuario.reportes)
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  // Ya no obligatoria: nace vacía en el paso 1 (datos del estafador) y se
  // llena en el paso 2, junto con la evidencia. Sigue siendo opcional
  // incluso en el paso 2 (el usuario puede no escribir nada extra).
  @Column('text', { nullable: true })
  descripcion: string | null;

  @Column({
    type: 'varchar',
    name: 'telefono_estafador',
    length: 20,
    nullable: true,
  })
  telefonoEstafador: string | null;

  @Column({
    type: 'varchar',
    name: 'enlace_sospechoso',
    length: 255,
    nullable: true,
  })
  enlaceSospechoso: string | null;

  @CreateDateColumn({ name: 'fecha_reporte' })
  fechaReporte: Date;

  @Column({ name: 'empresa_suplantada', length: 150, nullable: true })
  empresaSuplantada: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: EstadoReporte.PENDIENTE,
  })
  estado: EstadoReporte;

  @Column({ name: 'evidencia_principal', length: 255, nullable: true })
  evidenciaPrincipal: string;

  @OneToMany(() => Bitacora, (bitacora) => bitacora.reporte)
  bitacoras: Bitacora[];

  @OneToMany(() => Evidencia, (evidencia) => evidencia.reporte)
  evidencias: Evidencia[];
}
