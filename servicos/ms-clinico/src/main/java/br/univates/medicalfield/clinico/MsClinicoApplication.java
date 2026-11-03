package br.univates.medicalfield.clinico;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** ms-clinico: pessoas, prontuários, atendimentos, medicamentos e a sincronização com os aparelhos. */
@SpringBootApplication
public class MsClinicoApplication {

    public static void main(String[] args) {
        SpringApplication.run(MsClinicoApplication.class, args);
    }
}
