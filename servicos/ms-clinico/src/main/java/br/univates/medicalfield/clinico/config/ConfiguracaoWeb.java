package br.univates.medicalfield.clinico.config;

import br.univates.medicalfield.clinico.auditoria.FiltroLogAcesso;
import br.univates.medicalfield.clinico.auditoria.RegistradorDeAcessos;
import br.univates.medicalfield.clinico.seguranca.FiltroAutenticacao;
import br.univates.medicalfield.clinico.seguranca.InterceptorAdmin;
import br.univates.medicalfield.clinico.seguranca.LeitorDeToken;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import tools.jackson.databind.ObjectMapper;

/** Ordem da cadeia: log de acesso (por fora de tudo) → autenticação → controllers. */
@Configuration
public class ConfiguracaoWeb implements WebMvcConfigurer {

    @Bean
    FilterRegistrationBean<FiltroLogAcesso> filtroLogAcesso(RegistradorDeAcessos registrador) {
        FilterRegistrationBean<FiltroLogAcesso> registro = new FilterRegistrationBean<>(new FiltroLogAcesso(registrador));
        registro.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registro.addUrlPatterns("/*");
        return registro;
    }

    @Bean
    FilterRegistrationBean<FiltroAutenticacao> filtroAutenticacao(LeitorDeToken leitor, ObjectMapper json) {
        FilterRegistrationBean<FiltroAutenticacao> registro = new FilterRegistrationBean<>(new FiltroAutenticacao(leitor, json));
        registro.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        registro.addUrlPatterns("/*");
        return registro;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registro) {
        registro.addInterceptor(new InterceptorAdmin());
    }
}
