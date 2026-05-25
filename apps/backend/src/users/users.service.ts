import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "./entities/user.entity";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  findByGoogleId(googleId: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { googleId } });
  }

  async create(input: {
    email: string;
    passwordHash: string | null;
    googleId: string | null;
    name: string;
    avatarUrl?: string | null;
  }): Promise<UserEntity> {
    const entity = this.users.create({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      googleId: input.googleId,
      name: input.name,
      avatarUrl: input.avatarUrl ?? null,
    });
    return this.users.save(entity);
  }

  async linkGoogle(userId: string, googleId: string): Promise<void> {
    await this.users.update({ id: userId }, { googleId });
  }
}
