import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsuarioAutenticado } from './types/usuario-autenticado.type';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('sesion')
  @UseGuards(JwtAuthGuard)
  sesion(@Req() request: RequestAutenticada) {
    return request.user;
  }
}
