package br.univates.medicalfield.clinico.seguranca;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Rota restrita ao perfil ADMIN; perfil operacional recebe 403 PROIBIDO. */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface SomenteAdmin {
}
