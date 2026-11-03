package br.univates.medicalfield.clinico.config;

import br.univates.medicalfield.clinico.unificacao.EstrategiaDeMesclagem;
import br.univates.medicalfield.clinico.unificacao.MaisRecenteVence;
import br.univates.medicalfield.clinico.unificacao.Mesclador;
import br.univates.medicalfield.clinico.unificacao.ServidorVence;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ConfiguracaoGeral {

    /** Escolhe a estratégia de mesclagem pela configuração ESTRATEGIA_CONFLITO. */
    @Bean
    EstrategiaDeMesclagem estrategiaDeMesclagem(@Value("${medicalfield.conflito.estrategia}") String nome) {
        return switch (nome.strip().toUpperCase()) {
            case "MAIS_RECENTE_VENCE" -> new MaisRecenteVence();
            case "SERVIDOR_VENCE" -> new ServidorVence();
            default -> throw new IllegalArgumentException(
                    "ESTRATEGIA_CONFLITO inválida: " + nome + " (use MAIS_RECENTE_VENCE ou SERVIDOR_VENCE)");
        };
    }

    @Bean
    Mesclador mesclador(EstrategiaDeMesclagem estrategia) {
        return new Mesclador(estrategia);
    }

    @Bean
    OpenAPI especificacao() {
        return new OpenAPI()
                .info(new Info()
                        .title("MedicalField — ms-clinico")
                        .description("Pessoas, prontuários, atendimentos, medicamentos e sincronização. "
                                + "Contrato completo em docs/06-api.md.")
                        .version("1.0.0"))
                .components(new Components().addSecuritySchemes("bearer",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer"));
    }
}
