package br.univates.medicalfield.clinico;

import br.univates.medicalfield.clinico.auditoria.RegistradorDeAcessos;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Base dos testes de integração: sobe o ms-clinico de verdade (porta aleatória) contra o Postgres
 * de desenvolvimento (variáveis DB_*), com um par de chaves JWT gerado na hora. Tudo que os testes
 * criam é apagado no fim, pelo ID do profissional dos tokens.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public abstract class TesteIntegracao {

    protected static final KeyPair CHAVES = gerarChaves();
    private static final Path CHAVE_PUBLICA = escreverChavePublica(CHAVES);
    protected static final JsonMapper JSON = JsonMapper.builder().build();
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @Autowired
    protected Environment ambiente;
    @Autowired
    protected JdbcClient jdbc;
    @Autowired
    protected RegistradorDeAcessos registradorDeAcessos;

    private final List<UUID> profissionaisDoTeste = new ArrayList<>();

    @DynamicPropertySource
    static void propriedades(DynamicPropertyRegistry registro) {
        registro.add("medicalfield.jwt.chave-publica-arquivo", CHAVE_PUBLICA::toString);
        registro.add("spring.datasource.url", () -> "jdbc:postgresql://" + variavel("DB_HOST", "127.0.0.1") + ":"
                + variavel("DB_PORTA", "5433") + "/" + variavel("DB_NOME", "medicalfield"));
        registro.add("spring.datasource.username", () -> variavel("DB_USUARIO", "ms_clinico"));
        registro.add("spring.datasource.password", () -> variavel("DB_SENHA", ""));
    }

    protected static String variavel(String nome, String padrao) {
        String valor = System.getenv(nome);
        return valor == null || valor.isBlank() ? padrao : valor;
    }

    // ------------------------------------------------------------------ tokens

    protected String tokenOperacional() {
        return token("OPERACIONAL");
    }

    protected String tokenAdmin() {
        return token("ADMIN");
    }

    protected String token(String perfil) {
        UUID id = UUID.randomUUID();
        profissionaisDoTeste.add(id);
        return token(id, perfil, Instant.now().plus(10, ChronoUnit.MINUTES), CHAVES.getPrivate(), "medicalfield-auth",
                "medicalfield");
    }

    protected static String token(UUID id, String perfil, Instant expiraEm, PrivateKey chave, String emissor, String publico) {
        try {
            JWTClaimsSet claims = new JWTClaimsSet.Builder()
                    .subject(id.toString())
                    .issuer(emissor)
                    .audience(publico)
                    .claim("sid", UUID.randomUUID().toString())
                    .claim("nome", "Profissional de Teste")
                    .claim("tipoRegistro", "CRM")
                    .claim("registro", "TESTE-1")
                    .claim("perfil", perfil)
                    .issueTime(new Date())
                    .expirationTime(Date.from(expiraEm))
                    .jwtID(UUID.randomUUID().toString())
                    .build();
            SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).type(JOSEObjectType.JWT).build(), claims);
            jwt.sign(new RSASSASigner(chave));
            return jwt.serialize();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    protected static UUID idDoToken(String token) {
        try {
            return UUID.fromString(SignedJWT.parse(token).getJWTClaimsSet().getSubject());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------ HTTP

    protected record Resposta(int status, JsonNode corpo) {
        public String erro() {
            return corpo.path("erro").asString();
        }

        /** Campos citados em "detalhes" (erros de validação). */
        public List<String> camposComErro() {
            List<String> campos = new ArrayList<>();
            corpo.path("detalhes").forEach(d -> campos.add(d.path("campo").asString()));
            return campos;
        }
    }

    protected Resposta get(String caminho, String token) {
        return enviar(requisicao(caminho, token, Map.of()).GET());
    }

    protected Resposta get(String caminho, String token, Map<String, String> cabecalhos) {
        return enviar(requisicao(caminho, token, cabecalhos).GET());
    }

    protected Resposta post(String caminho, Object corpo, String token) {
        return post(caminho, corpo, token, Map.of());
    }

    protected Resposta post(String caminho, Object corpo, String token, Map<String, String> cabecalhos) {
        String texto = corpo instanceof String s ? s : JSON.writeValueAsString(corpo);
        return enviar(requisicao(caminho, token, cabecalhos)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(texto)));
    }

    private HttpRequest.Builder requisicao(String caminho, String token, Map<String, String> cabecalhos) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(
                "http://localhost:" + ambiente.getProperty("local.server.port") + caminho));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        cabecalhos.forEach(builder::header);
        return builder;
    }

    private static Resposta enviar(HttpRequest.Builder builder) {
        try {
            HttpResponse<String> resposta = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            String corpo = resposta.body();
            return new Resposta(resposta.statusCode(), corpo == null || corpo.isBlank()
                    ? JSON.createObjectNode() : JSON.readTree(corpo));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------ dados de teste

    protected static ObjectNode objeto() {
        return JSON.createObjectNode();
    }

    protected static ObjectNode origem(UUID criadoPorId, Instant criadoEm, String modo, String dispositivo) {
        ObjectNode origem = objeto()
                .put("criadoPorId", criadoPorId.toString())
                .put("criadoPorNome", "Profissional de Teste")
                .put("criadoPorRegistro", "CRM TESTE-1")
                .put("criadoEm", criadoEm.toString())
                .put("modo", modo);
        if (dispositivo != null) {
            origem.put("dispositivoId", UUID.nameUUIDFromBytes(dispositivo.getBytes()).toString());
            origem.put("dispositivoNome", dispositivo);
        }
        return origem;
    }

    /** CPF aleatório com dígitos verificadores válidos. */
    protected static String cpfAleatorio() {
        int[] d = new int[11];
        for (int i = 0; i < 9; i++) {
            d[i] = ThreadLocalRandom.current().nextInt(10);
        }
        d[9] = digito(d, 9);
        d[10] = digito(d, 10);
        StringBuilder cpf = new StringBuilder();
        for (int n : d) {
            cpf.append(n);
        }
        return cpf.toString();
    }

    private static int digito(int[] d, int quantidade) {
        int soma = 0;
        for (int i = 0; i < quantidade; i++) {
            soma += d[i] * (quantidade + 1 - i);
        }
        int resto = (soma * 10) % 11;
        return resto == 10 ? 0 : resto;
    }

    protected UUID criarPessoa(String token, String cpf) {
        Resposta r = post("/api/pessoa", objeto().put("id", UUID.randomUUID().toString()).put("nome", "Paciente de Teste")
                .put("cpf", cpf), token);
        if (r.status() != 201) {
            throw new IllegalStateException("criar pessoa: " + r);
        }
        return UUID.fromString(r.corpo().path("id").asString());
    }

    protected UUID criarProntuario(String token, UUID pessoaId) {
        Resposta r = post("/api/prontuario", objeto().put("id", UUID.randomUUID().toString())
                .put("pessoaId", pessoaId.toString()).put("tipoSanguineo", "O+"), token);
        if (r.status() != 201) {
            throw new IllegalStateException("criar prontuário: " + r);
        }
        return UUID.fromString(r.corpo().path("id").asString());
    }

    /** Medicamento inserido direto no banco, como no passo 9 do roteiro. */
    protected UUID criarMedicamento(String nome) {
        return jdbc.sql("INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao) VALUES (:nome, 'Ampola teste', 'MG') RETURNING id")
                .param("nome", "TESTE " + nome + " " + UUID.randomUUID())
                .query(UUID.class)
                .single();
    }

    // ------------------------------------------------------------------ limpeza

    @AfterAll
    void apagarDadosDoTeste() {
        if (profissionaisDoTeste.isEmpty()) {
            return;
        }
        String deTeste = "IN (:ids)";
        jdbc.sql("""
                DELETE FROM clinico.atendimento_medicamento am
                 USING clinico.atendimento a, clinico.prontuario pr, clinico.pessoa pe
                 WHERE am.atendimento_id = a.id AND a.prontuario_id = pr.id AND pr.pessoa_id = pe.id
                   AND (a.sincronizado_por_id %1$s OR pr.sincronizado_por_id %1$s OR pe.sincronizado_por_id %1$s)
                """.formatted(deTeste)).param("ids", profissionaisDoTeste).update();
        jdbc.sql("""
                DELETE FROM clinico.atendimento a
                 USING clinico.prontuario pr, clinico.pessoa pe
                 WHERE a.prontuario_id = pr.id AND pr.pessoa_id = pe.id
                   AND (a.sincronizado_por_id %1$s OR pr.sincronizado_por_id %1$s OR pe.sincronizado_por_id %1$s)
                """.formatted(deTeste)).param("ids", profissionaisDoTeste).update();
        jdbc.sql("""
                DELETE FROM clinico.unificacao u USING clinico.conflito c
                 WHERE u.conflito_id = c.id AND c.sincronizado_por_id %s
                """.formatted(deTeste)).param("ids", profissionaisDoTeste).update();
        jdbc.sql("DELETE FROM clinico.conflito WHERE sincronizado_por_id " + deTeste)
                .param("ids", profissionaisDoTeste).update();
        jdbc.sql("""
                DELETE FROM clinico.prontuario pr USING clinico.pessoa pe
                 WHERE pr.pessoa_id = pe.id AND (pr.sincronizado_por_id %1$s OR pe.sincronizado_por_id %1$s)
                """.formatted(deTeste)).param("ids", profissionaisDoTeste).update();
        jdbc.sql("DELETE FROM clinico.pessoa WHERE sincronizado_por_id " + deTeste)
                .param("ids", profissionaisDoTeste).update();
        jdbc.sql("DELETE FROM clinico.medicamento WHERE nome LIKE 'TESTE %'").update();
    }

    // ------------------------------------------------------------------ chaves

    private static KeyPair gerarChaves() {
        try {
            KeyPairGenerator gerador = KeyPairGenerator.getInstance("RSA");
            gerador.initialize(2048);
            return gerador.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static Path escreverChavePublica(KeyPair chaves) {
        try {
            String pem = "-----BEGIN PUBLIC KEY-----\n"
                    + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(chaves.getPublic().getEncoded())
                    + "\n-----END PUBLIC KEY-----\n";
            Path arquivo = Files.createTempFile("jwt-publica-teste", ".pem");
            Files.writeString(arquivo, pem);
            arquivo.toFile().deleteOnExit();
            return arquivo;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
