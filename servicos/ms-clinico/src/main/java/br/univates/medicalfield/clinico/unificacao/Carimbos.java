package br.univates.medicalfield.clinico.unificacao;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Lê e escreve a coluna jsonb "carimbos" ({"campo": "data/hora de origem do valor"}). */
@Component
public class Carimbos {

    private final ObjectMapper json;

    public Carimbos(ObjectMapper json) {
        this.json = json;
    }

    /** Na criação, todo campo recebe a data/hora do registro. */
    public String iniciais(Collection<String> colunas, Instant criadoEm) {
        Map<String, Instant> carimbos = new LinkedHashMap<>();
        colunas.forEach(coluna -> carimbos.put(coluna, criadoEm));
        return escrever(carimbos);
    }

    public String escrever(Map<String, Instant> carimbos) {
        Map<String, String> texto = new LinkedHashMap<>();
        carimbos.forEach((campo, instante) -> texto.put(campo, instante.toString()));
        return json.writeValueAsString(texto);
    }

    public Map<String, Instant> ler(String jsonb) {
        Map<String, Instant> carimbos = new LinkedHashMap<>();
        if (jsonb != null && !jsonb.isBlank()) {
            Map<String, String> texto = json.readValue(jsonb, new TypeReference<Map<String, String>>() { });
            texto.forEach((campo, valor) -> carimbos.put(campo, Instant.parse(valor)));
        }
        return carimbos;
    }
}
